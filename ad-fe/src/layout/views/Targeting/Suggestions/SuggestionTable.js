import React, { useContext, useEffect, useState, useRef } from "react";
import moment from "moment";
import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { PermissionCheck } from "../../../../helper/permission/PermissionCheck";
import { Button as ShadcnButton } from "../../../../components/ui/button";
import { Toast, useDispatch, handleLoader } from "../../../../helper/links/Link";
import { ProfileContext } from "../../../../helper/usecontext/useContext";
import { ApiGetKeywordSuggestions, ApiAddTargetings, ApiAddNegativeTargetings, ApiRemoveSearchTerm } from "../../../../api-wrapper/targeting/ApiTargeting";
import CurrencyFormat from "../../../../helper/currencyCode/CurrencyFormat";
import CurrencyCode from "../../../../helper/currencyCode/CurrencyCode";
import { useTranslation } from "react-i18next";
import { firstPageRows } from "../../../../helper/table/TableStyle";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../../../components/ui/dropdown-menu";
import AgTable from "../../../../common/grid/AgTable";
import { StyledCheckbox } from "../../../../common/grid/StyledCheckbox";
import AgCampaignCustomHeader from "../../../../common/grid/AgCampaignCustomHeader";
import CampaignFilterModal from "./CampaignFilterModal";
import CampaignTypeModal from "./CampaignTypeModal";
import SuggestedKeywordModal from "./SuggestedKeywordModal";
import KeywordExistsModal from "./KeywordExistsModal";
import SourceKeywordModal from "./SourceKeywordModal";
import AddKeywordStep1Modal from "./AddKeywordStep1Modal";
import AddKeywordStep2Modal from "./AddKeywordStep2Modal";
import AddKeywordStep3Modal from "./AddKeywordStep3Modal";
import AddNegativeKeywordModal from "./AddNegativeKeywordModal";
import { CampaignNameCell } from "../../../../utility/campaignNavigation";
import AddKeywordMultiCampaignModal from "./AddKeywordMultiCampaignModal";
import AddNegativeKeywordMultiCampaignModal from "./AddNegativeKeywordMultiCampaignModal";
import DismissConfirmModal from "./DismissConfirmModal";
import AppliedFilter from "../../../component/filter/AppliedFilter";
import { exportGridToExcel } from "../../../../utility/exportExcel";
import usePageFilter from "../../../../helper/filter/usePageFilter";

import { FaCheckCircle, FaTimesCircle, FaMinusCircle } from "react-icons/fa";

const STATUS_UI = {
  WINNER: { label: "Winner", color: "success", icon: <FaCheckCircle /> },
  POOR: { label: "Poor", color: "danger", icon: <FaTimesCircle /> },
  NEUTRAL: { label: "Neutral", color: "warning", icon: <FaMinusCircle /> },
};

const SuggestionTable = React.forwardRef(({ tabType, isActive = true }, ref) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const gridRef = useRef(null);
  const lastFetchParamsRef = useRef("");
  const { profileId, selectedAdType, selectedDate } = useContext(ProfileContext);

  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const handleRefresh = () => {
    fetchData({ ...arg, isReload: true, skipLoader: true });
  };

  React.useImperativeHandle(ref, () => ({
    handleGridFilter,
    exportExcel,
    refreshGrid: handleRefresh
  }));

  const [loading, setLoading] = useState(false);
  const [perPage, setPerPage] = useState(firstPageRows);
  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [tableData, setTableData] = useState([]);
  const [totalRows, setTotalRows] = useState(0);

  const [selectedRows, setSelectedRows] = useState([]); // stores full row objects
  const [selectAll, setSelectAll] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [searchName, setSearchName] = useState("");

  const defaultValue = {
    firstCondition: "",
    firstValue: 0,
    operator: "",
    secondCondition: "",
    secondValue: 0,
    sortType: "",
  };
  const [conditionObj, setConditionObj] = useState(defaultValue);

  const { isFilterReady } = usePageFilter({
    pageName: isActive ? "KeywordSuggestion_" + tabType : null,
    profileId: profileId?.value,
    selectedAdType,
    appliedFilters: conditionObj,
    setAppliedFilters: (saved) => {
      // If we load empty array or empty string, default to empty object
      if (!saved || (Array.isArray(saved) && saved.length === 0)) {
        setConditionObj({});
      } else {
        setConditionObj(saved);
      }
    }
  });

  const [showFilterModal, setShowFilterModal] = useState(""); // "" or "campaignName" or "adGroupName"
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [showSuggestedKwModal, setShowSuggestedKwModal] = useState(false);
  const [showKeywordExistsModal, setShowKeywordExistsModal] = useState(false);
  const [showSourceKwModal, setShowSourceKwModal] = useState(false);
  const [showAddKwStep1, setShowAddKwStep1] = useState(false);
  const [addKwStep1Rows, setAddKwStep1Rows] = useState([]);
  const [showAddKwStep2, setShowAddKwStep2] = useState(false);
  const [addKwStep2Rows, setAddKwStep2Rows] = useState([]);
  const [showAddKwStep3, setShowAddKwStep3] = useState(false);
  const [addKwStep3Payload, setAddKwStep3Payload] = useState([]);
  const [showAddNegKwModal, setShowAddNegKwModal] = useState(false);
  const [addNegKwRows, setAddNegKwRows] = useState([]);
  const [showMultiCampaignModal, setShowMultiCampaignModal] = useState(false);
  const [multiCampaignRows, setMultiCampaignRows] = useState([]);
  const [showNegMultiCampaignModal, setShowNegMultiCampaignModal] = useState(false);
  const [negMultiCampaignRows, setNegMultiCampaignRows] = useState([]);
  const [keywordStepSource, setKeywordStepSource] = useState(null);
  const [dismissModal, setDismissModal] = useState({ show: false, type: null }); // type: REMOVE_FROM_LIST | NEVER_RECOMMANDED
  const [customFilterFlag, setCustomFilterFlag] = useState(false);
  const [fieldName, setfieldName] = useState("");

  const sharedFilterParams = {
    conditionObj,
    setConditionObj,
    setfieldName,
    setCustomFilterFlag,
    defaultValue,
  };

  const fetchData = async (payload) => {
    if (!profileId?.value || !isActive) return;

    const isReload = !!payload?.skipLoader || !!payload?.isReload;
    const fromDateStr = selectedDate?.[0] ? moment(selectedDate[0]).format("YYYY-MM-DD") : "";
    const toDateStr = selectedDate?.[1] ? moment(selectedDate[1]).format("YYYY-MM-DD") : "";

    const requestSignature = JSON.stringify({
      profileId: profileId.value,
      selectedAdType,
      tabType,
      fromDate: fromDateStr,
      toDate: toDateStr,
      searchName,
      fieldFilters: conditionObj,
      fieldName,
      pageNo: payload?.pageNo ?? arg?.pageNo,
      perPage: payload?.perPage ?? arg?.perPage,
      ...payload
    });

    if (!isReload && lastFetchParamsRef.current === requestSignature) {
      return;
    }

    lastFetchParamsRef.current = requestSignature;
    setLoading(true);

    const data = {
      profileId: profileId.value,
      campaignType: tabType, // MANUAL or AUTO
      fromDate: fromDateStr,
      toDate: toDateStr,
      searchName,
      fieldFilters: conditionObj,
      fieldName,
      ...payload
    };

    try {
      const response = await ApiGetKeywordSuggestions(data);
      if (response?.isSuccess) {
        setTableData(response?.result || []);
        setTotalRows(response?.totalRows || 0);
      } else {
        Toast.error(response?.message || "Error fetching suggestions");
      }
    } catch (error) {
      lastFetchParamsRef.current = "";
      Toast.error(t("Something went wrong"));
    } finally {
      setLoading(false);
    }
  };

  const exportExcel = async () => {
    if (!profileId?.value) return;
    dispatch(handleLoader(true));
    try {
      const fromDateStr = selectedDate?.[0] ? moment(selectedDate[0]).format("YYYY-MM-DD") : "";
      const toDateStr = selectedDate?.[1] ? moment(selectedDate[1]).format("YYYY-MM-DD") : "";
      const data = {
        profileId: profileId.value,
        campaignType: tabType,
        fromDate: fromDateStr,
        toDate: toDateStr,
        searchName,
        fieldFilters: conditionObj,
        fieldName,
        ...arg,
        pageNo: 1,
        perPage: 100000
      };
      const response = await ApiGetKeywordSuggestions(data, { skipLoader: false });
      if (response?.isSuccess) {
        const allData = response?.result || [];
        exportGridToExcel(allData, columns, `keyword_suggestions_${tabType.toLowerCase()}_export.xlsx`);
      } else {
        Toast.error(response?.message || "Error exporting suggestions");
      }
    } catch (error) {
      console.error("Export error:", error);
      Toast.error(t("Something went wrong during export"));
    } finally {
      dispatch(handleLoader(false));
    }
  };

  useEffect(() => {
    lastFetchParamsRef.current = "";
  }, [profileId?.value]);

  useEffect(() => {
    if (isFilterReady && isActive) {
      fetchData(arg);
    }
  }, [isFilterReady, isActive, selectedAdType, tabType, searchName, conditionObj, selectedDate]);

  const handlePageChange = (page) => {
    const newArg = { ...arg, pageNo: page };
    setArg(newArg);
  };

  const handlePerRowsChange = (newPerPage) => {
    setPerPage(newPerPage);
    const newArg = { ...arg, pageNo: 1, perPage: newPerPage };
    setArg(newArg);
  };

  // Group columns helper
  const renderMetricCols = (days, prefix) => [
    {
      headerName: t(`${days} DAYS SPEND`),
      field: `${prefix}.spend`,
      width: 140,
      sortable: true,
      cellRenderer: (p) => <>{p.value != 0 ? `${CurrencyCode(p.value)}` : "—"}</>,
      cellClass: "bg-gray-100",
    },
    {
      headerName: t(`${days} DAYS REVENUE`),
      field: `${prefix}.sales`,
      width: 140,
      sortable: true,
      cellRenderer: (p) => <>{p.value != 0 ? `${CurrencyCode(p.value)}` : "—"}</>,
      cellClass: "bg-gray-100",
    },
    {
      headerName: t(`${days} DAYS IMPR.`),
      field: `${prefix}.impressions`,
      width: 130,
      sortable: true,
      cellRenderer: (p) => <>{p.value != 0 ? CurrencyFormat(p.value) : "—"}</>,
      cellClass: "bg-gray-100",
    },
    {
      headerName: t(`${days} DAYS CLICKS`),
      field: `${prefix}.clicks`,
      width: 130,
      sortable: true,
      cellRenderer: (p) => <>{p.value != 0 ? CurrencyFormat(p.value) : "—"}</>,
      cellClass: "bg-gray-100",
    },
    {
      headerName: t(`${days} DAYS AVG CPC`),
      field: `${prefix}.cpc`,
      width: 140,
      sortable: true,
      cellRenderer: (p) => <>{p.value != 0 ? `${CurrencyCode(p.value)}` : "—"}</>,
      cellClass: "bg-gray-100",
    },
    {
      headerName: t(`${days} DAYS ACOS`),
      field: `${prefix}.acos`,
      width: 130,
      sortable: true,
      cellRenderer: (p) => <>{p.value ? `${p.value}%` : "—"}</>,
      cellClass: "bg-gray-100",
    },
    {
      headerName: t(`${days} DAYS ROAS`),
      field: `${prefix}.roas`,
      width: 120,
      sortable: true,
      cellRenderer: (p) => <>{p.value ? `${p.value}` : "—"}</>,
      cellClass: "bg-gray-100",
    },
  ];

  const columns = React.useMemo(() => [
    ...(PermissionCheck(SYSTEM_PAGES.KEYWORD_TRACKER, PAGE_ACTIONS.UPDATE) || PermissionCheck(SYSTEM_PAGES.KEYWORD_TRACKER, PAGE_ACTIONS.REMOVE) ? [{
      headerName: "",
      field: "id",
      width: 50,
      pinned: isMobile ? null : "left",
      lockPinned: true,
      suppressMovable: true,
      sortable: false,
      resizable: false,
      headerComponent: () => (
        <div className="flex items-center justify-center" style={{ width: "100%" }}>
          <StyledCheckbox
            checked={selectAll}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedRows(tableData);
                setSelectAll(true);
              } else {
                setSelectedRows([]);
                setSelectAll(false);
              }
            }}
          />
        </div>
      ),
      cellStyle: { display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff" },
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <StyledCheckbox
            id={params.node.rowIndex === 0 ? "keyword-suggestion-first-checkbox" : ""}
            checked={selectedRows.some((r) => r?.id === row?.id)}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedRows((prev) => [...prev, row]);
              } else {
                setSelectedRows((prev) => prev.filter((r) => r?.id !== row?.id));
                setSelectAll(false);
              }
            }}
          />
        );
      },
    }] : []),
    {
      headerName: t("REASON"),
      field: "reason",
      width: 160,
      pinned: isMobile ? null : "left",
      resizable: true,
      cellStyle: { backgroundColor: "#ffffff" },
      cellRenderer: (params) => (
        <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 py-1 px-2">
          {t(params.value)}
        </span>
      ),
    },
    {
      headerName: t("SUGGESTED KEYWORD"),
      field: "searchTerm",
      width: 180,
      pinned: isMobile ? null : "left",
      resizable: true,
      tooltipField: "searchTerm",
      cellStyle: { backgroundColor: "#ffffff" },
      cellRenderer: (params) => (
        <div style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }} title={params.value}>
          <span className="fw-bolder">
            {params.value}
          </span>
        </div>
      ),
    },
    {
      headerName: t("SOURCE KEYWORD"),
      field: "targeting",
      width: 180,
      pinned: isMobile ? null : "left",
      resizable: true,
      tooltipField: "targeting",
      cellStyle: { backgroundColor: "#ffffff" },
      cellRenderer: (params) => (
        <div style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }} title={params.value}>{params.value}</div>
      )
    },
    {
      headerName: t("CAMPAIGN"),
      field: "campaignName",
      width: 220,
      resizable: true,
      tooltipField: "campaignName",
      cellStyle: { backgroundColor: "#ffffff" },
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return <CampaignNameCell row={row} name={params.value} campaignId={row.campaignId} />;
      },
      headerComponent: AgCampaignCustomHeader,
      headerComponentParams: { conditionObj, setConditionObj, field: "campaignName", hasFilter: true, fetchData, campaignType: tabType },
    },
    {
      headerName: t("AD GROUP"),
      field: "adGroupName",
      width: 180,
      resizable: true,
      tooltipField: "adGroupName",
      cellStyle: { backgroundColor: "#ffffff" },
      cellRenderer: (params) => (
        <div style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }} title={params.value}>{params.value}</div>
      ),
      headerComponent: AgCampaignCustomHeader,
      headerComponentParams: { conditionObj, setConditionObj, field: "adGroupName", hasFilter: true, fetchData, campaignType: tabType },
    },
    {
      headerName: t("CAMPAIGN TYPE"),
      field: "keywordType",
      width: 150,
      resizable: true,
      cellStyle: { backgroundColor: "#ffffff" },
      exportFormatter: (val) => ["EXACT", "PHRASE", "BROAD", "TARGETING_EXPRESSION"].includes(val) ? "SP" : "AT",
      cellRenderer: (params) => {
        let type = "AUTO";
        if (["EXACT", "PHRASE", "BROAD", "TARGETING_EXPRESSION"].includes(params.value)) {
          type = "MANUAL";
        }
        return (
          <span className="badge bg-secondary text-white rounded-circle flex items-center justify-center mx-auto" style={{ width: "32px", height: "32px", fontSize: "10px" }}>
            {type === "MANUAL" ? "SP" : "AT"}
          </span>
        );
      }
    },
    ...renderMetricCols(7, "days7"),
    ...renderMetricCols(14, "days14"),
    ...renderMetricCols(30, "days30"),
    {
      headerName: t("KEYWORD EXISTS IN ACCOUNT"),
      field: "keywordExistsInAccount",
      width: 220,
      resizable: true,
      cellStyle: { backgroundColor: "#ffffff" },
      exportFormatter: (val) => val ? t("Yes") : t("No"),
      cellRenderer: (params) => (
        <span className={`badge ${params.value ? "bg-success" : "bg-danger"} py-1 px-2`}>
          {params.value ? t("Yes") : t("No")}
        </span>
      ),
    }
  ], [selectedRows, selectAll, tableData, conditionObj, isMobile, t]);

  const handleSortChanged = (e) => {
    const sortModel = e.columns;
    if (!sortModel || sortModel.length === 0) return;
    const { colId, sortDef: { direction: sort } } = sortModel?.reverse()?.[0];
    setArg({ fieldName: colId, ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }), ...arg });
  };

  const removeFilter = (key) => {
    const updated = { ...conditionObj };
    delete updated[key];
    setConditionObj(updated);
  };

  const clearAllFilters = () => {
    setConditionObj({});
  };

  const activeFilterEntries = Object.entries(conditionObj).filter(([_, conf]) => conf.value);

  const handleGridFilter = ({ target: { value } }) => {
    if (value === "Campaign") setShowFilterModal("campaignName");
    else if (value === "Ad Group") setShowFilterModal("adGroupName");
    else if (value === "Campaign Type") setShowTypeModal(true);
    else if (value === "Suggested Keyword") setShowSuggestedKwModal(true);
    else if (value === "Keyword Exists") setShowKeywordExistsModal(true);
    else if (value === "Source Keyword") setShowSourceKwModal(true);
  };

  return (
    <div>
      {/* ── Action Bar — shown when rows are selected ── */}
      {selectedRows.length > 0 && (
        <div
          id="keyword-suggestion-action-bar"
          className="flex items-center gap-3 px-4 py-3 mb-3 transition-all duration-300 border rounded-2xl"
          style={{
            background: isDark ? "rgba(15, 23, 42, 0.95)" : "rgba(255, 255, 255, 0.98)",
            borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(15, 23, 42, 0.08)",
            backdropFilter: "blur(8px)",
            color: isDark ? "#fff" : "#0f172a",
            boxShadow: isDark ? "0 10px 30px -5px rgba(0, 0, 0, 0.5)" : "0 10px 30px -5px rgba(15, 23, 42, 0.08)",
            position: "relative",
            zIndex: 10,
            margin: "10px"
          }}
        >
          <span className="small font-bold mr-2 font-sans" style={{ color: isDark ? "rgba(255, 255, 255, 0.9)" : "rgba(15, 23, 42, 0.9)" }}>
            {selectedRows.length} {selectedRows.length > 1 ? t("rows") : t("row")} {t("selected")}
          </span>

          {/* Add As Keyword (Only for MANUAL tab) */}
          {tabType !== "AUTO" && PermissionCheck(SYSTEM_PAGES.KEYWORD_TRACKER, PAGE_ACTIONS.UPDATE) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  id="keyword-suggestion-add-as-keyword"
                  className="h-[32px] px-3 bg-white text-slate-800 dark:bg-white/5 dark:text-slate-200 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 active:scale-[0.98] transition-all flex items-center gap-2 font-bold text-xs rounded-xl shadow-sm cursor-pointer"
                >
                  <i className="fa-solid fa-plus-circle text-[#2374F2]"></i> {t("Add As Keyword")}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[200px] bg-white dark:bg-[#131c31]/95 border border-slate-200 dark:border-white/10 shadow-lg rounded-xl p-1 text-slate-900 dark:text-white">
                <DropdownMenuItem
                  className="cursor-pointer px-3 py-2 rounded-lg text-xs font-semibold hover:bg-slate-100 dark:hover:bg-white/5 transition-colors focus:bg-slate-100 dark:focus:bg-white/5 focus:outline-none"
                  onClick={() => {
                    setAddKwStep1Rows(selectedRows);
                    setShowAddKwStep1(true);
                  }}
                >
                  {t("Add to Current Campaign")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer px-3 py-2 rounded-lg text-xs font-semibold hover:bg-slate-100 dark:hover:bg-white/5 transition-colors focus:bg-slate-100 dark:focus:bg-white/5 focus:outline-none"
                  onClick={() => {
                    setMultiCampaignRows(selectedRows);
                    setShowMultiCampaignModal(true);
                  }}
                >
                  {t("Add To Multiple Campaign")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Add As Negative Keyword */}
          {PermissionCheck(SYSTEM_PAGES.KEYWORD_TRACKER, PAGE_ACTIONS.UPDATE) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-[32px] px-3 bg-white text-slate-800 dark:bg-white/5 dark:text-slate-200 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 active:scale-[0.98] transition-all flex items-center gap-2 font-bold text-xs rounded-xl shadow-sm cursor-pointer"
                >
                  <i className="fa-solid fa-minus-circle text-[#ef4444]"></i> {t("Add As Negative Keyword")}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[200px] bg-white dark:bg-[#131c31]/95 border border-slate-200 dark:border-white/10 shadow-lg rounded-xl p-1 text-slate-900 dark:text-white">
                <DropdownMenuItem
                  className="cursor-pointer px-3 py-2 rounded-lg text-xs font-semibold hover:bg-slate-100 dark:hover:bg-white/5 transition-colors focus:bg-slate-100 dark:focus:bg-white/5 focus:outline-none"
                  onClick={() => {
                    setAddNegKwRows(selectedRows);
                    setShowAddNegKwModal(true);
                  }}
                >
                  {t("Add to Current Campaign")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer px-3 py-2 rounded-lg text-xs font-semibold hover:bg-slate-100 dark:hover:bg-white/5 transition-colors focus:bg-slate-100 dark:focus:bg-white/5 focus:outline-none"
                  onClick={() => {
                    setNegMultiCampaignRows(selectedRows);
                    setShowNegMultiCampaignModal(true);
                  }}
                >
                  {t("Add To Multiple Campaign")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Dismiss Button */}
          {PermissionCheck(SYSTEM_PAGES.KEYWORD_TRACKER, PAGE_ACTIONS.REMOVE) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-[32px] px-3 bg-white text-slate-800 dark:bg-white/5 dark:text-slate-200 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 active:scale-[0.98] transition-all flex items-center gap-2 font-bold text-xs rounded-xl shadow-sm cursor-pointer"
                >
                  <i className="fa-solid fa-eye-slash text-slate-500"></i> {t("Dismiss")}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[200px] bg-white dark:bg-[#131c31]/95 border border-slate-200 dark:border-white/10 shadow-lg rounded-xl p-1 text-slate-900 dark:text-white">
                <DropdownMenuItem
                  className="cursor-pointer px-3 py-2 rounded-lg text-xs font-semibold hover:bg-slate-100 dark:hover:bg-white/5 transition-colors focus:bg-slate-100 dark:focus:bg-white/5 focus:outline-none"
                  onClick={() => setDismissModal({ show: true, type: "REMOVE_FROM_LIST" })}
                >
                  {t("Remove From List")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer px-3 py-2 rounded-lg text-xs font-semibold hover:bg-slate-100 dark:hover:bg-white/5 transition-colors focus:bg-slate-100 dark:focus:bg-white/5 focus:outline-none"
                  onClick={() => setDismissModal({ show: true, type: "NEVER_RECOMMANDED" })}
                >
                  {t("Never Recommend Again")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Clear Selection */}
          <button
            className="ml-auto px-3.5 py-1.5 flex items-center gap-1.5 rounded-xl text-xs font-bold transition-all duration-200 active:scale-[0.98] border cursor-pointer font-sans"
            style={{
              background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)",
              borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)",
              color: isDark ? "rgba(255, 255, 255, 0.8)" : "rgba(15, 23, 42, 0.8)"
            }}
            onClick={() => { setSelectedRows([]); setSelectAll(false); }}
          >
            <i className="fa-solid fa-xmark" /> {t("Clear Selection")}
          </button>
        </div>
      )}
      <div className="flex justify-between items-center my-3">
        <div className="flex items-center gap-3">
          <CampaignFilterModal
            displayName={showFilterModal === "campaignName" ? "CAMPAIGN" : "AD GROUP"}
            paramId={showFilterModal}
            conditionObj={conditionObj}
            setConditionObj={setConditionObj}
            fetchData={fetchData}
            externalShow={showFilterModal !== ""}
            setExternalShow={(isOpen) => !isOpen && setShowFilterModal("")}
            campaignType={tabType}
          />
          <CampaignTypeModal
            show={showTypeModal}
            onHide={() => setShowTypeModal(false)}
            conditionObj={conditionObj}
            setConditionObj={setConditionObj}
          />
          <SuggestedKeywordModal
            show={showSuggestedKwModal}
            onHide={() => setShowSuggestedKwModal(false)}
            conditionObj={conditionObj}
            setConditionObj={setConditionObj}
          />
          <KeywordExistsModal
            show={showKeywordExistsModal}
            onHide={() => setShowKeywordExistsModal(false)}
            conditionObj={conditionObj}
            setConditionObj={setConditionObj}
          />
          <SourceKeywordModal
            show={showSourceKwModal}
            onHide={() => setShowSourceKwModal(false)}
            conditionObj={conditionObj}
            setConditionObj={setConditionObj}
          />
        </div>
      </div>

      <AddKeywordStep1Modal
        show={showAddKwStep1}
        onHide={() => setShowAddKwStep1(false)}
        selectedRows={addKwStep1Rows}
        onNext={(confirmedRows) => {
          setShowAddKwStep1(false);
          setAddKwStep2Rows(confirmedRows);
          setKeywordStepSource("STEP1");
          setShowAddKwStep2(true);
        }}
      />

      {/* Multi Campaign Modal — feeds into same Step2 → Step3 flow */}
      <AddKeywordMultiCampaignModal
        show={showMultiCampaignModal}
        onHide={() => setShowMultiCampaignModal(false)}
        selectedRows={multiCampaignRows}
        onNext={(rows) => {
          setShowMultiCampaignModal(false);
          setAddKwStep2Rows(rows);
          setKeywordStepSource("MULTI");
          setShowAddKwStep2(true);
        }}
      />

      <AddKeywordStep2Modal
        show={showAddKwStep2}
        onHide={() => setShowAddKwStep2(false)}
        onBack={() => {
          setShowAddKwStep2(false);
          if (keywordStepSource === "MULTI") {
            setShowMultiCampaignModal(true);
          } else {
            setShowAddKwStep1(true);
          }
        }}
        rows={addKwStep2Rows}
        onNext={(payload) => {
          setShowAddKwStep2(false);
          setAddKwStep3Payload(payload);
          setShowAddKwStep3(true);
        }}
      />

      <AddKeywordStep3Modal
        show={showAddKwStep3}
        onHide={() => setShowAddKwStep3(false)}
        onBack={() => {
          setShowAddKwStep3(false);
          setShowAddKwStep2(true);
        }}
        payload={addKwStep3Payload}
        onSubmit={async (finalPayload) => {
          setShowAddKwStep3(false);
          setSelectedRows([]);
          setSelectAll(false);
          dispatch(handleLoader(true));
          try {
            const res = await ApiAddTargetings({
              profileId: profileId?.value,
              items: finalPayload.map((r) => ({
                searchTerm: r.keyword,
                campaignId: r.campaignId,
                adGroupId: r.adGroupId,
                suggestedBid: r.bid,
                type: r.matchType,
                campaignType: r.campaignType,
              })),
            });
            if (res?.isSuccess) {
              Toast.success(t("Keywords added successfully!"));
              fetchData(arg);
            } else {
              Toast.error(res?.message || "Failed to add keywords.");
            }
          } catch (e) {
            Toast.error(t("Something went wrong. Please try again."));
          }
          dispatch(handleLoader(false));
        }}
      />

      <AddNegativeKeywordModal
        show={showAddNegKwModal}
        onHide={() => setShowAddNegKwModal(false)}
        selectedRows={addNegKwRows}
        onSubmit={async (items) => {
          setShowAddNegKwModal(false);
          setSelectedRows([]);
          setSelectAll(false);
          dispatch(handleLoader(true));
          try {
            const res = await ApiAddNegativeTargetings({
              profileId: profileId?.value,
              items: items.map((r) => ({
                searchTerm: r.searchTerm,
                campaignId: r.campaignId,
                adGroupId: r.adGroupId,
                type: r.type,
                campaignType: r.campaignType,
              })),
            });
            if (res?.isSuccess) {
              Toast.success(t("Negative keywords added successfully!"));
              fetchData(arg);
            } else {
              Toast.error(res?.message || "Failed to add negative keywords.");
            }
          } catch (e) {
            Toast.error(t("Something went wrong. Please try again."));
          }
          dispatch(handleLoader(false));
        }}
      />

      <AddNegativeKeywordMultiCampaignModal
        show={showNegMultiCampaignModal}
        onHide={() => setShowNegMultiCampaignModal(false)}
        selectedRows={negMultiCampaignRows}
        onSubmit={async (items) => {
          setShowNegMultiCampaignModal(false);
          setSelectedRows([]);
          setSelectAll(false);
          dispatch(handleLoader(true));
          try {
            const res = await ApiAddNegativeTargetings({
              profileId: profileId?.value,
              items: items.map((r) => ({
                searchTerm: r.searchTerm,
                campaignId: r.campaignId,
                adGroupId: r.adGroupId,
                type: r.type,
                campaignType: r.campaignType,
              })),
            });
            if (res?.isSuccess) {
              Toast.success(t("Negative keywords added to multiple campaigns successfully!"));
              fetchData(arg);
            } else {
              Toast.error(res?.message || "Failed to add negative keywords.");
            }
          } catch (e) {
            Toast.error(t("Something went wrong. Please try again."));
          }
          dispatch(handleLoader(false));
        }}
      />

      <DismissConfirmModal
        show={dismissModal.show}
        type={dismissModal.type}
        selectedRows={selectedRows}
        onHide={() => setDismissModal({ show: false, type: null })}
        onConfirm={async () => {
          setDismissModal({ show: false, type: null });
          setSelectedRows([]);
          setSelectAll(false);
          dispatch(handleLoader(true));
          try {
            const res = await ApiRemoveSearchTerm({
              profileId: profileId?.value,
              type: dismissModal.type,
              items: selectedRows.map((r) => ({
                searchTerm: r.searchTerm,
                campaignId: r.campaignId,
                adGroupId: r.adGroupId,
              })),
            });
            if (res?.isSuccess) {
              const msg = dismissModal.type === "NEVER_RECOMMANDED"
                ? "Keywords marked as Never Recommend Again."
                : "Keywords removed from suggestions list.";
              Toast.success(msg);
              fetchData(arg);
            } else {
              Toast.error(res?.message || "Failed to dismiss keywords.");
            }
          } catch (e) {
            Toast.error(t("Something went wrong. Please try again."));
          }
          dispatch(handleLoader(false));
        }}
      />

      {(() => {
        const appliedFiltersMapped = activeFilterEntries.map(([key, conf]) => {
          const keyMap = {
            campaignName: "Campaign",
            adGroupName: "Ad Group",
            type: "Campaign Type",
            searchTerm: "Suggested Keyword",
            keywordExistsInAccount: "Keyword Exists",
            targeting: "Source Keyword"
          };
          const opMap = {
            EQUALS: "Equals",
            CONTAINS: "Contains",
            NOT_CONTAINS: "Does not contain",
            NOT_EQUALS: "Does not equal",
            SELECT: "Select"
          };
          const displayKey = keyMap[key] || key;
          let displayVal = conf.value;
          let opText = opMap[conf.operator] ? `${opMap[conf.operator]}: ` : "";

          if (key === "keywordExistsInAccount") {
            displayVal = conf.value === "true" ? "Yes" : "No";
            opText = ""; // dont show operator for Yes/No
          } else if (conf.value.includes("\n")) {
            displayVal = `${conf.value.split("\n").filter(Boolean).length} items selected`;
          }

          return {
            id: key,
            type: displayKey,
            displayText: `${displayKey}: ${opText}${displayVal}`
          };
        });

        return (
          <AppliedFilter
            appliedFilters={appliedFiltersMapped}
            handleGridFilter={handleGridFilter}
            handleRemoveSingleFilter={removeFilter}
            setAppliedFilters={(arr) => {
              if (arr.length === 0) clearAllFilters();
            }}
          />
        );
      })()}

      <div id="keyword-suggestion-main-table" className="data_table mt-3">
        <AgTable
          onRefresh={handleRefresh} ref={gridRef}
          loading={!isFilterReady || loading}
          rowData={tableData}
          columnDefs={columns}
          pagination={true}
          paginationServer={true}
          totalRecords={totalRows}
          currentPage={arg.pageNo}
          onPageChange={handlePageChange}
          onPerPageChange={handlePerRowsChange}
          onSortChanged={handleSortChanged}
          perPage={perPage}
          height="65vh"
        />
      </div>
    </div>
  );
});

export default SuggestionTable;
