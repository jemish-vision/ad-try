import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import React, { useContext, useState, useEffect, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import Filter from "../../../helper/filter/Filter";
import AgTable from "../../../common/grid/AgTable";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { ApiProductListing } from "../../../api-wrapper/product/ApiProduct";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../../../components/ui/select";

import moment from "moment";
import { Toast, handleLoader, useDispatch } from "../../../helper/links/Link";
import { useLocation } from "react-router-dom";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import CurrencyCode from "../../../helper/currencyCode/CurrencyCode";
import { useTranslation } from "react-i18next";
import CustomizeColumns from "../../../helper/modal/CustomizeColumns";
import { ApiListGetColumns, ApiListUpdateColumns } from "../../../api-wrapper/columns/ApiColumns";
import ProductCampagin from "./Product/ProductCampagin";
import CurrencyFormat from "../../../helper/currencyCode/CurrencyFormat";
import { exportGridToExcel } from "../../../utility/exportExcel";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import AgCustomHeader from "../../../common/grid/AgCustomHeader";
import ProductPerformanceCharts from "./Product/ProductPerformanceCharts";
import { useDebouncedColumnSave } from "../../../utility/useDebouncedColumnSave";
import CustomCVRTag from "../../../common/grid/CustomCVRTag";
import { MdOutlineClose } from "react-icons/md";
import { AppTooltip } from "../../../components/ui/AppTooltip";

// Portal-based tooltip immune to AG-Grid CSS transform offsets

function Product() {
  const { t } = useTranslation();
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const [showAdGroup, setShowAdGroup] = useState(false);
  const [addName, setAddName] = useState("Add Campaign");
  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [tableData, setTableData] = useState([]);
  const [groupsData, setGroupsData] = useState([]);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isNarrow, setIsNarrow] = useState(window.innerWidth < 500);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
      setIsNarrow(window.innerWidth < 500);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const [perPage, setPerPage] = useState(firstPageRows);
  const [date, setDate] = useState([]);
  const [editData, setEditData] = useState();
  let { profileId, selectedAdType, selectedDate, setSelectedDate } = useContext(ProfileContext);
  const dispatch = useDispatch();
  const location = useLocation();
  const [status, setStatus] = useState("ENABLED");
  const [type, setType] = useState("");
  const [addFlag, setaddFlag] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [debouncedSearchName, setDebouncedSearchName] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchName(searchName);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchName]);

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
  const [customFilterFlag, setCustomFilterFlag] = useState(false);
  const [fieldName, setfieldName] = useState("sales");

  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState([]);
  const [defaultColumns] = useState(["Product Details"]);

  const sharedFilterParams = {
    conditionObj,
    setConditionObj,
    setfieldName,
    setCustomFilterFlag,
    defaultValue,
  };

  // ── Column visibility / ordering helper ──────────────────────────────────
  const checkOrderColumns = (title) => {
    const matched = visibleColumns?.find((col) => col?.title === title);
    return {
      width: matched?.width ?? 200,
      hide: Boolean(visibleColumns?.length && !matched),
      order: matched?.order ?? 9999,
    };
  };

  // ── Column definitions (AG Grid style) ───────────────────────────────────
  const columns = [
    // ── Expand Column ───────────────────────────────────────────────────
    {
      headerName: "",
      field: "expand",
      maxWidth: 50,
      pinned: isMobile ? null : "left",
      lockPinned: !isMobile,
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
      },
    },

    // ── Product Details ──────────────────────────────────────────────────
    {
      headerName: t("productDetails"),
      field: "productDetails",
      title: "Product Details",
      exportFormatter: (val, row) => row?.productData?.title || row?.asins || row?.sku || "",
      ...(checkOrderColumns("Product Details")),
      minWidth: 400,
      pinned: isMobile ? null : "left",
      lockPinned: !isMobile,
      suppressMovable: true,
      sortable: false,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const statusClass =
          row.status === " " ? "cancelled"
            : row.status === "PAUSED" ? "pending"
              : row.status === "ENABLED" ? "completed"
                : row.status === "ARCHIVED" ? "archived"
                  : row.status === "OUT_OF_BUDGET" ? "outOfBudget"
                    : "";
        return (
          <div id={"product-ads-first-target-" + params.node.rowIndex} className="flex items-center my-2 cursor-pointer">
            {row?.productData?.imageUrl && (
              <img
                src={row?.productData?.imageUrl}
                alt="product"
                style={{ width: "60px", height: "60px", objectFit: "cover" }}
                className="rounded mr-3"
              />
            )}
            <div className="campaignStatus flex items-center">
              <div className={`customStatus m-2 p-1 ${statusClass}`} />
              <div className="flex flex-col">
                <span className="font-semibold" style={{ whiteSpace: "normal", wordBreak: "break-word" }}>
                  {row?.productData?.title}
                </span>
                <div className="flex flex-col small text-gray-500 mt-1">
                  <span>
                    <strong className={isDark ? "text-light" : "text-dark"}>{t("asins")}:</strong> {row?.asins || "-"}
                  </span>
                  <span>
                    <strong className={isDark ? "text-light" : "text-dark"}>{t("SKU")}:</strong> {row?.sku || "-"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      },
    },

    // ── Sales ────────────────────────────────────────────────────────────
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

    // ── ROAS ─────────────────────────────────────────────────────────────
    {
      headerName: t("roas"),
      field: "roas",
      title: "ROAS",
      exportFormatter: (val) => val !== "" && val != null ? val : "—",
      ...(checkOrderColumns("ROAS")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{params.value ?? "N/A"}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "roas", hasFilter: true },
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

    // ── Clicks ────────────────────────────────────────────────────────────
    {
      headerName: t("clicks"),
      field: "clicks",
      title: "Clicks",
      ...(checkOrderColumns("Clicks")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{CurrencyFormat(params.value ?? 0)}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "clicks", hasFilter: true },
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
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "ctr", hasFilter: true },
    },

    // ── CVR ───────────────────────────────────────────────────────────────
    {
      headerName: t("cvr"),
      field: "conversionRate",
      title: "CVR",
      exportFormatter: (val) => val ? `${val}%` : "N/A",
      ...(checkOrderColumns("CVR")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{params.value ? `${params.value}%` : "N/A"}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "conversionRate", hasFilter: true },
    },

    // ── Performance ───────────────────────────────────────────────────────────────
    {
      headerName: t("performance"),
      field: "conversionRate",
      title: "Performance CVR",
      ...(checkOrderColumns("Performance CVR")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <CustomCVRTag value={params?.value} isValueShow={false} />,
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

    // ── ACOS ──────────────────────────────────────────────────────────────
    {
      headerName: t("acos"),
      field: "acos",
      title: "ACOS",
      exportFormatter: (val) => val ? `${val}%` : "N/A",
      ...(checkOrderColumns("ACOS")),
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <>{params.value ? `${params.value}%` : "N/A"}</>,
      headerComponent: AgCustomHeader,
      headerComponentParams: { ...sharedFilterParams, field: "acos", hasFilter: true },
    },
  ];

  // ── Detail cell renderer (campaign expansion) ────────────────────────────
  const detailCellRenderer = useCallback(
    (params) => (
      <div style={{ padding: "12px 20px", background: isDark ? "rgba(20, 24, 33, 0.5)" : "#f8f9fa", border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0", borderRadius: "12px" }}>
        <ProductCampagin
          data={params?.data?.campaigns}
          visibleColumns={visibleColumns}
        />
      </div>
    ),
    [visibleColumns, isDark]
  );
  const detailCellRendererParams = { detailGridOptions: {} };

  // ── Fetch saved column config ─────────────────────────────────────────────
  useEffect(() => {
    const fetchCustomColumns = async () => {
      const body = { pageName: "Product Ads" };
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
    setShowCustomizeModal(false);

    const optimisticVisible = (columns ?? [])
      .map(c => ({ ...c, ...selectedColumns.find(col => col.title === c.title) }))
      .filter(c => c?.isDisplay || !c?.title)
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
      .filter(Boolean);
    setVisibleColumns(optimisticVisible);

    const body = {
      pageName: "Product Ads",
      columns: selectedColumns,
    };
    const response = await ApiListUpdateColumns(body);
    if (response?.isSuccess && response?.data?.columns) {
      const visible = (columns ?? [])
        .map(c => ({ ...c, ...response?.data?.columns.find(col => col.title === c.title) }))
        .filter(c => c?.isDisplay || !c?.title)
        .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
        .filter(Boolean);
      setVisibleColumns(visible);
      dispatch(handleLoader(false));
    }
  };

  useEffect(() => {
    if (location.state?.searchName) {
      setSearchName(location.state.searchName);
      if (location.state.fromDate && location.state.toDate) {
        setDate([new Date(location.state.fromDate), new Date(location.state.toDate)]);
      }
      window.history.replaceState({}, document.title);
      return;
    }
  }, [location.state]);

  useEffect(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
      setDate([moment(selectedDate[0]).toDate(), moment(selectedDate[1]).toDate()]);
    } else {
      let storeData;
      try {
        storeData = JSON.parse(localStorage.getItem('profile'));
        console.log(storeData)
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

  const [loading, setLoading] = useState(true);
  const lastFetchParamsRef = useRef("");

  const ApiListing = (argOverride = {}) => {
    if (profileId?.value && selectedAdType && date.length !== 0) {
      const isReload = !!argOverride?.isReload;
      const data = {
        searchName: argOverride?.hasOwnProperty("searchName") ? argOverride.searchName : debouncedSearchName,
        status: status,
        type: type,
        profileId: profileId.value,
        fromDate: moment(date?.[0]).format("YYYY-MM-DD"),
        toDate: moment(date?.[1]).format("YYYY-MM-DD"),
        fieldName: fieldName,
        fieldOperator: conditionObj?.firstCondition,
        fieldValue: Number(conditionObj.firstValue),
        conditions: conditionObj?.operator,
        extraFieldOperator: conditionObj?.secondCondition,
        extraFieldValue: Number(conditionObj?.secondValue),
        sortType: conditionObj?.sortType,
        ...arg,
        ...argOverride,
      };

      const requestSignature = JSON.stringify(data);
      if (!isReload && lastFetchParamsRef.current === requestSignature) {
        return;
      }

      lastFetchParamsRef.current = requestSignature;
      setLoading(true);

      ApiProductListing(data)
        .then((e) => {
          if (e?.isSuccess) {
            setTableData(e?.getProductAds);
            setGroupsData(e);
          } else {
            Toast.error(e?.message);
          }
          setCustomFilterFlag(false);
        })
        .catch((e) => {
          Toast.error(t("Something went wrong"));
        })
        .finally(() => {
          setLoading(false);
        });
    }
  };

  const exportExcel = async () => {
    if (profileId?.value && selectedAdType && date.length !== 0) {
      dispatch(handleLoader(true));
      try {
        const data = {
          searchName: searchName,
          status: status,
          type: type,
          profileId: profileId.value,
          fromDate: moment(date?.[0]).format("YYYY-MM-DD"),
          toDate: moment(date?.[1]).format("YYYY-MM-DD"),
          fieldName: fieldName,
          fieldOperator: conditionObj?.firstCondition,
          fieldValue: Number(conditionObj.firstValue),
          conditions: conditionObj?.operator,
          extraFieldOperator: conditionObj?.secondCondition,
          extraFieldValue: Number(conditionObj?.secondValue),
          sortType: conditionObj?.sortType,
          pageNo: 1,
          perPage: 100000,
        };
        const response = await ApiProductListing(data);
        if (response?.isSuccess) {
          const allData = response?.getProductAds || [];
          exportGridToExcel(allData, columns, "product_export.xlsx");
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
  }, [profileId?.value]);

  const fromDateStr = date?.[0] ? moment(date[0]).format("YYYY-MM-DD") : "";
  const toDateStr = date?.[1] ? moment(date[1]).format("YYYY-MM-DD") : "";

  useEffect(() => {
    ApiListing(arg);
  }, [profileId?.value, selectedAdType, fromDateStr, toDateStr, type, status, debouncedSearchName]);

  useEffect(() => {
    if (customFilterFlag) ApiListing(arg);
  }, [customFilterFlag]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSortChanged = (e) => {
    const sortModel = e.columns;
    if (!sortModel || sortModel.length === 0) return;
    const { colId, sortDef: { direction: sort } } = sortModel?.reverse()?.[0];
    ApiListing({ fieldName: colId, ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }), ...arg });
  };

  const handlePageChange = (page) => {
    setArg({ pageNo: page, perPage });
    ApiListing({ pageNo: page, perPage });
  };

  const handlePerRowsChange = (newPerPage) => {
    setPerPage(newPerPage);
    setArg({ pageNo: 1, perPage: newPerPage });
    ApiListing({ pageNo: 1, perPage: newPerPage });
  };

  const handleSearch = (e) => {
    setSearchName(e.target.value);
  };

  const handleClose = () => {
    setShowAdGroup(false);
    ApiListing(arg);
  };

  return (
    <div className="product-list-tracking-container">
      <Filter nameShow={false} dateShow={false} profileShow={true} />
      <div className="middle_container" id="productAdsList">
        {PermissionCheck(SYSTEM_PAGES.PRODUCT_ADS, PAGE_ACTIONS.VIEW_ONLY) && (
          <ProductPerformanceCharts
            date={date}
            searchName={debouncedSearchName}
            status={status}
            type={type}
            conditionObj={conditionObj}
            fieldName={fieldName}
          />
        )}
        <div className="data_content data_content_btn" style={{ width: "100%", marginTop: 0, border: "none", background: "transparent", boxShadow: "none" }}>
          <div
            id="product-ads-filters"
            className={`glass-sticky-header dash-filter-bar ${!isMobile ? "sticky-top" : ""}`}
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              flexWrap: "wrap",
              overflowX: "auto",
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
            {/* ROW 1: Search and Status */}
            <div className="flex items-center" style={{ flexWrap: "wrap", gap: 12, width: isNarrow ? "100%" : "auto" }}>
              {/* Search Option */}
              <div id="product-ads-search" className="search_option m-0 flex items-center" style={{ position: "relative", flex: "1 1 auto", minWidth: 200, maxWidth: isNarrow ? "100%" : 320, width: isNarrow ? "100%" : undefined, height: "40px" }}>
                <input
                  type="text"
                  placeholder={t("searchHere")}
                  value={searchName}
                  onChange={handleSearch}
                  style={{ flexGrow: 1, width: "100%", height: "40px", border: "none", outline: "none", background: "transparent", boxShadow: "none", paddingRight: searchName ? "30px" : "10px" }}
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

              {/* Status Dropdown */}
              <div id="product-ads-status" style={{ flex: "1 1 auto", minWidth: 240, maxWidth: isNarrow ? "100%" : 360, width: isNarrow ? "100%" : undefined }}>
                <Select value={status || "all"} onValueChange={(val) => setStatus(val === "all" ? "" : val)}>
                  <SelectTrigger className="w-full h-[40px] px-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-md">
                    <SelectValue placeholder={t("allStatus")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("allStatus")}</SelectItem>
                    <SelectItem value="ENABLED">{t("enabled")}</SelectItem>
                    <SelectItem value="PAUSED">{t("paused")}</SelectItem>
                    <SelectItem value="ENDED">{t("ended")}</SelectItem>
                    <SelectItem value="ARCHIVED">{t("archived")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ROW 2: Date Picker */}
            <div className="flex" style={{ flexWrap: "wrap", gap: 12, width: isNarrow ? "100%" : "auto", marginLeft: isNarrow ? "0px" : "auto", flex: "1 1 auto", justifyContent: "flex-end" }}>
              <div id="product-ads-date-picker" style={{ flex: "1 1 auto", minWidth: 240, maxWidth: isNarrow ? "100%" : 260, width: isNarrow ? "100%" : undefined }}>
                <DateRangePicker
                  className="w-full"
                  style={{ width: "100%", height: "40px" }}
                  ranges={predefinedRanges}
                  value={date}
                  placeholder={t("Select Date")}
                  onChange={handleDateChange}
                  placement="bottomEnd"
                  format="yyyy-MM-dd"
                  cleanable={false}
                />
              </div>
            </div>
          </div>

          <div className="glass-grid-container overflow-hidden">
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
              <div style={{ flex: "0 0 auto" }}>
                <h5 className="m-0 font-bold whitespace-nowrap">{t("productAds")}</h5>
              </div>

              {/* Right-aligned group */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginLeft: "auto", justifyContent: "flex-end", flex: isMobile ? "1 1 100%" : "0 0 auto" }}>
                <AppTooltip text={t("Customize Columns")}>
                  <button
                    id="product-ads-customize-columns"
                    onClick={async () => setShowCustomizeModal(true)}
                    className="customize-button m-0 gap-0"
                    style={{ height: "36px", whiteSpace: "nowrap", flexGrow: isMobile ? 1 : 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    {t("Columns")}
                    <span style={{ fontSize: 9, marginLeft: 6, display: "inline-block", verticalAlign: "middle" }}>▼</span>
                  </button>
                </AppTooltip>
                <AppTooltip text={t("Export to Excel")}>
                  <button
                    onClick={exportExcel}
                    className="customize-button m-0"
                    style={{ height: "36px", whiteSpace: "nowrap", flexGrow: isMobile ? 1 : 0 }}
                  >
                    {t("Export")}
                  </button>
                </AppTooltip>
              </div>
            </div>

            {PermissionCheck(SYSTEM_PAGES.PRODUCT_ADS, PAGE_ACTIONS.VIEW_ONLY) && (
              <div className="data_table position-relative" id="product-main-table">
                <AgTable
                  tableId="product-main-table"
                  loading={loading}
                  onRefresh={() => ApiListing({ ...arg, isReload: true })}
                  rowData={tableData}
                  columnDefs={columns}
                  customSaveColumnName="Product Ads"
                  isCustomSaveColumns={true}
                  totalRecords={groupsData?.totalRecords ?? 0}
                  height={"70vh"}
                  minHeight={600}
                  rowHeight={100}
                  perPage={perPage}
                  currentPage={customFilterFlag ? 1 : arg.pageNo}
                  onPageChange={handlePageChange}
                  onPerPageChange={handlePerRowsChange}
                  onSortChanged={handleSortChanged}
                  paginationOptions={paginationRowsPerPageOptions}
                  handleSaveColumns={handleSaveColumns}
                  masterDetail={true}
                  detailCellRenderer={detailCellRenderer}
                  detailCellRendererParams={detailCellRendererParams}
                  detailRowAutoHeight={true}
                  isRowMaster={(row) => Boolean(row?.campaigns?.length)}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <CustomizeColumns
        showModal={showCustomizeModal}
        setShowModal={setShowCustomizeModal}
        allColumns={columns}
        selectedColumn={visibleColumns}
        handler={handleSaveColumns}
        defaultColumns={defaultColumns}
      />
    </div>
  );
}

export default Product;